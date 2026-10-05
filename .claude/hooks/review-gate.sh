#!/usr/bin/env bash
# 코드 리뷰 관문: Claude가 바꾼 코드는 작업을 끝내기 전에 code-reviewer 리뷰를 한 번 거치게 한다.
#   review-gate.sh mark   PostToolUse(Edit|Write)        바뀐 소스 파일을 기록한다
#   review-gate.sh start  SubagentStart(code-reviewer)   리뷰가 진행 중임을 기록한다
#   review-gate.sh done   SubagentStop(code-reviewer)    바뀐 뒤 리뷰가 끝났음을 기록한다
#   review-gate.sh stop   Stop                           리뷰 전이면 종료를 막고 리뷰를 요청한다
# 리뷰 뒤에 지적 사항을 고친 수정은 다시 리뷰하지 않는다(lint·build·test 훅이 확인한다).
set -uo pipefail
source "$(dirname "$0")/lib.sh"

state="$project_dir/.claude/hooks/.state"
changed="$state/changed-files" # 마지막 리뷰 이후 바뀐 파일 목록
reviewing="$state/reviewing"   # 리뷰 진행 중 표시
reviewed="$state/reviewed"     # 바뀐 뒤 리뷰가 끝났다는 표시
blocked="$state/blocked"       # 이번 작업에서 이미 한 번 막았다는 표시(무한 반복 방지)
mkdir -p "$state"
input=$(cat)

case "${1:-}" in
  mark)
    rel=$(changed_source_file "$input") || exit 0
    grep -qxF "$rel" "$changed" 2>/dev/null || echo "$rel" >>"$changed"
    ;;

  start)
    touch "$reviewing"
    ;;

  done)
    rm -f "$reviewing"
    [[ -s "$changed" ]] && touch "$reviewed"
    ;;

  stop)
    if [[ ! -s "$changed" || -e "$reviewed" ]]; then
      rm -f "$changed" "$reviewed" "$blocked"
      exit 0
    fi
    # 서브에이전트는 백그라운드로 돌기 때문에 리뷰를 맡긴 직후에도 응답이 끝난다.
    # 리뷰 결과가 돌아오면 Claude가 다시 깨어나 이어서 처리하므로 여기서는 막지 않는다.
    # 30분이 지난 표시는 에이전트가 비정상 종료한 흔적으로 보고 무시한다.
    if [[ -e "$reviewing" && -z "$(find "$reviewing" -mmin +30)" ]]; then
      exit 0
    fi
    if [[ -e "$blocked" ]]; then
      # 한 번 요청했는데도 리뷰 없이 끝내면 더 막지 않고 알리기만 한다. 다음 작업이 끝날 때 다시 요청한다.
      rm -f "$blocked"
      jq -n '{systemMessage: "⚠️ 바뀐 코드가 아직 리뷰되지 않았습니다. 다음 작업이 끝날 때 다시 리뷰를 요청합니다."}'
      exit 0
    fi
    touch "$blocked"
    jq -n --arg files "$(sed 's/^/- /' "$changed")" '{
      decision: "block",
      reason: ("이번 작업에서 아래 파일이 바뀌었는데 아직 코드 리뷰를 받지 않았습니다.\n" + $files + "\n\n"
        + "code-reviewer 서브에이전트에 이 파일들의 변경 사항을 리뷰하게 하세요. "
        + "🔴 Critical·🟠 Major 지적은 고친 뒤 마무리하되, 스펙을 어떻게 할지 판단이 필요한 지적은 고치지 말고 사용자에게 물어보세요. "
        + "🟡 Minor·⚪ Nit은 고치지 말고 사용자에게 요약해서 전달하세요."),
      systemMessage: "🔍 코드가 바뀌어서 마무리 전에 code-reviewer 리뷰를 진행합니다."
    }'
    ;;

  *)
    echo "사용법: $0 mark|start|done|stop" >&2
    exit 1
    ;;
esac
exit 0
