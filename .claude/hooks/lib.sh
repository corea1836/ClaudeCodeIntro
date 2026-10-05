# 훅 스크립트 공용 함수 (source로 불러 쓴다)

project_dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# PostToolUse 입력(JSON)에서 편집된 파일을 꺼내, 검사·리뷰 대상 소스 파일이면 프로젝트 기준 상대경로를 출력한다.
# 문서, .claude 설정, node_modules, 프로젝트 밖 파일은 대상이 아니다(반환값 1).
changed_source_file() {
  local file cwd
  file=$(jq -r '.tool_input.file_path // empty' <<<"$1")
  cwd=$(jq -r '.cwd // empty' <<<"$1")
  [[ -z "$file" ]] && return 1
  [[ "$file" != /* ]] && file="${cwd:-$project_dir}/$file"
  case "$file" in
    "$project_dir"/.claude/* | "$project_dir"/node_modules/*) return 1 ;;
    "$project_dir"/*.html | "$project_dir"/*.js | "$project_dir"/*.mjs | "$project_dir"/*.json)
      echo "${file#"$project_dir"/}" ;;
    *) return 1 ;;
  esac
}
