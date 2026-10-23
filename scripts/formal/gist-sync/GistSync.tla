------------------------------ MODULE GistSync ------------------------------
(***************************************************************************)
(* Gist 동기화와 복습 커밋이 같은 IndexedDB('tms-krv')에서 엇갈릴 때, 사용자가 *)
(* 남긴 복습 증거(ReviewEntry)와 FSRS 진도(reps)가 살아남는지 본다.          *)
(*                                                                         *)
(* 코드 대응 (한 동작 = 코드의 한 원자 단위):                              *)
(*   (잠금)             src/adapters/gist.ts syncNow — fetch부터 push까지 기기별 *)
(*                      navigator.locks 안. SyncFetch의 SyncLockFree 가드     *)
(*   SyncFetch[Fails]   src/adapters/gist.ts fetchRemote — GET 한 번으로 Gist의 *)
(*                      tms-sync*.json 전부를 읽어 mergeBundles로 접는다       *)
(*                      (truncated 파일의 raw_url은 리비전 고정이라 같은 시점) *)
(*   SyncMerge          src/adapters/indexeddb.ts IdbStore.mergeAll — 한 트랜잭션 *)
(*                      안에서 현재 로컬을 읽고 병합해 cards/reviews를 교체     *)
(*   SyncPush[Fails]    src/adapters/gist.ts pushRemote — 이 기기 파일 하나만  *)
(*                      PATCH (조건부 아님)                                   *)
(*   ReviewLoad         src/views/hooks.ts useDueCards — 큐를 읽어 화면이     *)
(*                      StoredCard 사본을 들고 있는다(리비전으로 재조회 안 함) *)
(*   ReviewCommit       src/app/review.ts submitReview → rateCard(사본) →     *)
(*                      IdbCards.commitRating: 기준 상태 확인 + reviews.add + *)
(*                      cards.put 한 트랜잭션                                 *)
(*   ReviewStale        commitRating이 기준 상태 불일치로 StaleCardError —     *)
(*                      아무것도 쓰지 않고, Review.tsx가 카드를 다시 읽어 출제 *)
(*   ReviewCommitTorn   commitRating의 두 번째 쓰기가 던진 경우 — 첫 쓰기만    *)
(*                      남는다(indexeddb.ts 주석: 자동 롤백되지 않음)         *)
(*                                                                         *)
(* 추상화: 카드는 한 장, 카드 상태는 reps 하나(병합 규칙이 reps로 고르므로).  *)
(* 기준 상태 확인도 reps로만 한다 — 코드는 reps·last_review·due를 모두 비교하니 *)
(* 코드가 더 엄격하다. 복습 기록은 고유 id 집합(병합 키 충돌은 다루지 않음). *)
(* learning 스토어(사다리·졸업)는 모델에 없다.                               *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Devices,           \* 기기마다 IndexedDB 하나
    SyncTabs,          \* 한 기기에서 동시에 돌 수 있는 syncNow 수(탭 여러 개, 설정 화면 재진입)
    MaxReviews,        \* 기기마다 커밋 시도 상한
    MaxSyncs,          \* 기기마다 syncNow 시작 상한
    CommitDuringSync,  \* syncNow가 fetch와 merge 사이일 때 채점(커밋)하는가
    SessionAcrossSync  \* merge 전에 읽은 복습 화면 사본으로 merge 뒤에 채점하는가

None == 0  \* view가 비어 있음. reps 사본은 1을 더해 저장한다(아래 ReviewLoad)

ReviewIds == Devices \X (1..MaxReviews)
SyncProcs == Devices \X (1..SyncTabs)
\* Gist 파일: 기기마다 tms-sync-<deviceId>.json, 그리고 옛 버전이 쓰던 tms-sync.json
Files == Devices \cup {"legacy"}
Bundle == [reps : Nat, reviews : SUBSET ReviewIds]
Empty == [reps |-> 0, reviews |-> {}]

VARIABLES
    cards,      \* [Devices -> Nat]  'cards' 스토어의 그 카드 reps
    reviews,    \* [Devices -> SUBSET ReviewIds]  'reviews' 스토어
    files,      \* [Files -> Bundle]  Gist의 파일들
    view,       \* [Devices -> Nat]  None 또는 (화면이 들고 있는 reps + 1)
    viewStale,  \* [Devices -> BOOLEAN]  화면 사본을 읽은 뒤 mergeAll이 있었나
    sp,         \* [SyncProcs -> 동기화 진행 상태]
    made,       \* [Devices -> Nat]  커밋 시도 수(id 발급용)
    started,    \* [Devices -> Nat]  syncNow 시작 수
    committed,  \* 유령 변수: 기기별로 commitRating이 성공을 돌려준 복습 id
    acked       \* 유령 변수: "동기화 완료"를 돌려준 push에 실렸던 복습 id

vars == <<cards, reviews, files, view, viewStale, sp, made, started, committed, acked>>

Idle == [pc |-> "idle", fetched |-> Empty, snap |-> Empty, merged |-> Empty]

Local(d) == [reps |-> cards[d], reviews |-> reviews[d]]

(* gist.ts mergeBundles(a, b). *)
\* 카드: `c.card.reps > prev.card.reps`면 교체 — 결과 reps는 큰 쪽
MergeReps(a, b) == IF b > a THEN b ELSE a
\* 리뷰: 양쪽을 키로 합집합
MergeReviews(a, b) == a \cup b
Merge(a, b) ==
    [reps |-> MergeReps(a.reps, b.reps), reviews |-> MergeReviews(a.reviews, b.reviews)]

\* fetchRemote: Gist의 모든 tms-sync*.json을 mergeBundles로 접는다
RECURSIVE FoldFiles(_)
FoldFiles(S) ==
    IF S = {} THEN Empty
    ELSE LET f == CHOOSE x \in S : TRUE IN Merge(files[f], FoldFiles(S \ {f}))
Fetched == FoldFiles(Files)

\* pushRemote가 쓰는 파일: 이 기기 것 하나
FileOf(d) == d

\* mergeAll의 병합 기준: 같은 트랜잭션 안에서 읽은 현재 로컬
MergeBase(p) == Local(p[1])

\* commitRating이 증거(reviews.add)를 카드(cards.put)보다 먼저 쓴다
EvidenceFirst == TRUE

\* commitRating: 저장된 카드가 채점 기준(화면 사본)과 같을 때만 쓴다
BaseMatches(d) == cards[d] + 1 = view[d]

\* syncNow 전체(fetch~push)가 기기별 잠금(navigator.locks 'tms-sync:<deviceId>') 안에서 돈다
SyncLockFree(d) == \A t \in 1..SyncTabs : sp[<<d, t>>].pc = "idle"

\* fetch를 마쳤고 아직 merge하지 않은 syncNow가 이 기기에 있다
InWindow(d) == \E t \in 1..SyncTabs : sp[<<d, t>>].pc = "merge"

TypeOK ==
    /\ cards \in [Devices -> Nat]
    /\ reviews \in [Devices -> SUBSET ReviewIds]
    /\ files \in [Files -> Bundle]
    /\ view \in [Devices -> Nat]
    /\ viewStale \in [Devices -> BOOLEAN]
    /\ \A p \in SyncProcs : sp[p].pc \in {"idle", "merge", "push"}
    /\ committed \in [Devices -> SUBSET ReviewIds]
    /\ acked \in SUBSET ReviewIds

Init ==
    /\ cards = [d \in Devices |-> 0]
    /\ reviews = [d \in Devices |-> {}]
    /\ files = [f \in Files |-> Empty]
    /\ view = [d \in Devices |-> None]
    /\ viewStale = [d \in Devices |-> FALSE]
    /\ sp = [p \in SyncProcs |-> Idle]
    /\ made = [d \in Devices |-> 0]
    /\ started = [d \in Devices |-> 0]
    /\ committed = [d \in Devices |-> {}]
    /\ acked = {}

-----------------------------------------------------------------------------
(* 복습 화면 *)

ReviewLoad(d) ==
    /\ view[d] = None
    /\ made[d] < MaxReviews
    /\ view' = [view EXCEPT ![d] = cards[d] + 1]
    /\ viewStale' = [viewStale EXCEPT ![d] = FALSE]
    /\ UNCHANGED <<cards, reviews, files, sp, made, started, committed, acked>>

\* 사용자가 지금 채점 버튼을 누를 수 있는가 (환경 가정)
CanRate(d) ==
    /\ view[d] # None
    /\ made[d] < MaxReviews
    /\ CommitDuringSync \/ ~InWindow(d)
    /\ SessionAcrossSync \/ ~viewStale[d]

\* rateCard(사본): 새 reps = 사본 reps + 1. cards.put은 덮어쓰기다.
ReviewCommit(d) ==
    LET id == <<d, made[d] + 1>> IN
    /\ CanRate(d)
    /\ BaseMatches(d)
    /\ reviews' = [reviews EXCEPT ![d] = @ \cup {id}]
    /\ cards' = [cards EXCEPT ![d] = view[d]]
    /\ view' = [view EXCEPT ![d] = None]
    /\ made' = [made EXCEPT ![d] = @ + 1]
    /\ committed' = [committed EXCEPT ![d] = @ \cup {id}]
    /\ UNCHANGED <<files, viewStale, sp, started, acked>>

\* StaleCardError: 아무것도 쓰지 않고 화면은 카드를 다시 읽는다
ReviewStale(d) ==
    /\ CanRate(d)
    /\ ~BaseMatches(d)
    /\ view' = [view EXCEPT ![d] = None]
    /\ UNCHANGED <<cards, reviews, files, viewStale, sp, made, started, committed, acked>>

\* 첫 쓰기만 남고 submitReview는 reject — 화면은 같은 카드에 머문다
ReviewCommitTorn(d) ==
    LET id == <<d, made[d] + 1>> IN
    /\ CanRate(d)
    /\ BaseMatches(d)
    /\ IF EvidenceFirst
         THEN /\ reviews' = [reviews EXCEPT ![d] = @ \cup {id}]
              /\ UNCHANGED cards
         ELSE /\ cards' = [cards EXCEPT ![d] = view[d]]
              /\ UNCHANGED reviews
    /\ made' = [made EXCEPT ![d] = @ + 1]
    /\ UNCHANGED <<files, view, viewStale, sp, started, committed, acked>>

-----------------------------------------------------------------------------
(* syncNow: fetchRemote → mergeAll(mergeBundles) → pushRemote *)

SyncFetch(p) ==
    LET d == p[1] IN
    /\ sp[p].pc = "idle"
    /\ SyncLockFree(d)
    /\ started[d] < MaxSyncs
    /\ sp' = [sp EXCEPT ![p].pc = "merge", ![p].fetched = Fetched, ![p].snap = Local(d)]
    /\ started' = [started EXCEPT ![d] = @ + 1]
    /\ UNCHANGED <<cards, reviews, files, view, viewStale, made, committed, acked>>

SyncFetchFails(p) ==
    LET d == p[1] IN
    /\ sp[p].pc = "idle"
    /\ SyncLockFree(d)
    /\ started[d] < MaxSyncs
    /\ started' = [started EXCEPT ![d] = @ + 1]
    /\ UNCHANGED <<cards, reviews, files, view, viewStale, sp, made, committed, acked>>

SyncMerge(p) ==
    LET d == p[1]
        m == Merge(MergeBase(p), sp[p].fetched)
    IN
    /\ sp[p].pc = "merge"
    /\ cards' = [cards EXCEPT ![d] = m.reps]
    /\ reviews' = [reviews EXCEPT ![d] = m.reviews]
    /\ viewStale' = [viewStale EXCEPT ![d] = view[d] # None]
    /\ sp' = [sp EXCEPT ![p].pc = "push", ![p].merged = m]
    /\ UNCHANGED <<files, view, made, started, committed, acked>>

SyncPush(p) ==
    /\ sp[p].pc = "push"
    /\ files' = [files EXCEPT ![FileOf(p[1])] = sp[p].merged]
    /\ acked' = acked \cup sp[p].merged.reviews
    /\ sp' = [sp EXCEPT ![p] = Idle]
    /\ UNCHANGED <<cards, reviews, view, viewStale, made, started, committed>>

SyncPushFails(p) ==
    /\ sp[p].pc = "push"
    /\ sp' = [sp EXCEPT ![p] = Idle]
    /\ UNCHANGED <<cards, reviews, files, view, viewStale, made, started, committed, acked>>

-----------------------------------------------------------------------------

Next ==
    \/ \E d \in Devices :
         ReviewLoad(d) \/ ReviewCommit(d) \/ ReviewStale(d) \/ ReviewCommitTorn(d)
    \/ \E p \in SyncProcs :
         \/ SyncFetch(p) \/ SyncFetchFails(p)
         \/ SyncMerge(p)
         \/ SyncPush(p) \/ SyncPushFails(p)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* 성질 *)

\* commitRating이 성공한 복습 기록은 그 기기에서 지워지지 않는다 (하드 경계 3)
EvidenceSurvives == \A d \in Devices : committed[d] \subseteq reviews[d]

\* 저장된 카드 상태는 저장된 증거로 뒷받침된다: reps <= 복습 기록 수 (하드 경계 1)
EvidenceBacksState == \A d \in Devices : cards[d] <= Cardinality(reviews[d])

\* 한 기기에서 카드 진도(reps)가 뒤로 가지 않는다
ProgressSurvives == [][\A d \in Devices : cards'[d] >= cards[d]]_vars

\* "동기화 완료"로 Gist에 올라간 복습 기록은 Gist에서 사라지지 않는다
SyncedStaysSynced == acked \subseteq UNION {files[f].reviews : f \in Files}

=============================================================================
