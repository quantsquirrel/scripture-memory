--------------------------- MODULE GistSyncMutants ---------------------------
(***************************************************************************)
(* 각 성질이 실제로 실패할 수 있음을 보이는 변이. mutant-*.cfg가 GistSync의   *)
(* 정의를 아래 것으로 바꿔 끼운다. 변이 하나 = 실제 코드에서 일어날 법한 수정 *)
(* 하나.                                                                   *)
(***************************************************************************)
EXTENDS GistSync

\* gist.ts mergeBundles가 원격 리뷰만 남긴다 ([...a.reviews, ...b.reviews] → b.reviews)
MutMergeReviewsRemoteOnly(a, b) == b

\* gist.ts mergeBundles가 카드 비교 조건 없이 원격 카드로 덮는다 (if 조건 제거)
MutMergeRepsRemoteWins(a, b) == b

\* indexeddb.ts commitRating이 cards.put을 reviews.add보다 먼저 한다
MutCardFirst == FALSE

\* syncNow가 mergeAll 대신 exportAll(네트워크 전) + importAll로 되돌아간다 (옛 F1)
MutMergeBaseSnapshot(p) == sp[p].snap

\* commitRating이 기준 상태 확인을 하지 않는다 (옛 F3)
MutNoBaseCheck(d) == TRUE

\* pushRemote가 모든 기기 공용 파일 tms-sync.json에 쓴다 (옛 F2)
MutSharedFile(d) == "legacy"

\* syncNow가 기기별 잠금 없이 돈다 — 같은 기기의 두 push가 자기 파일을 뒤바꿔 덮는다
MutNoSyncLock(d) == TRUE

=============================================================================
