$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'git is not available in PATH.'
}

$branch = (git branch --show-current).Trim()
if (-not $branch) {
  throw 'Unable to determine the current branch.'
}

$status = git status --porcelain
if ($status) {
  git add -A
  git commit -m 'Deploy ResumePro updates'
}

git push upstream $branch