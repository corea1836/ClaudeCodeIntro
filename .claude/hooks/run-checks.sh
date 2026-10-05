#!/usr/bin/env bash
# PostToolUse(Edit|Write) 훅: 프로젝트 소스가 바뀌면 lint → build → test를 돌린다.
# 실패하면 exit 2로 끝내 결과를 Claude에게 돌려준다. 이미 끝난 편집을 되돌리지는 않는다.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

rel=$(changed_source_file "$(cat)") || exit 0

cd "$project_dir" || exit 0
if [[ ! -d node_modules ]]; then
  echo "검사 도구가 설치되어 있지 않습니다. 프로젝트 루트에서 'npm install'을 먼저 실행하세요." >&2
  exit 2
fi

report=""
check() { # $1: 단계 이름, 나머지: npm run 인자
  local name=$1 out
  shift
  if ! out=$(npm run --silent "$@" 2>&1); then
    report+="❌ npm run $name 실패"$'\n'"$(tail -n 60 <<<"$out")"$'\n\n'
  fi
}
check lint lint
check build build
check test test -- --test-reporter=dot # 통과한 테스트는 점으로만 찍혀 실패 내용이 잘 보인다

if [[ -n "$report" ]]; then
  {
    echo "$rel 수정 뒤 검사가 실패했습니다."
    echo
    printf '%s' "$report"
    echo "위 문제를 고친 뒤 다시 확인하세요. 전체 검사는 'npm run check'로 돌릴 수 있습니다."
  } >&2
  exit 2
fi
exit 0
