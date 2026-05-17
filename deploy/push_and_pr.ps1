<#
PowerShell helper: push local main to pages-build-deployment and create a PR.
Requirements:
- You must have write access to https://github.com/Dileep2505/ResumePro
- Install Git and GitHub CLI (`gh`) and authenticate (`gh auth login`)

Usage:
  Open PowerShell in the repo root and run:
    .\deploy\push_and_pr.ps1
#>

param()

function Abort($msg){ Write-Host $msg -ForegroundColor Red; exit 1 }

# Ensure we're in repo root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location (Split-Path $scriptDir -Parent)

# Check git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Abort 'Git not found. Install Git and retry.' }
# Check gh
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Abort 'GitHub CLI (gh) not found. Install from https://cli.github.com/ and retry.' }

# Show last commit
Write-Host "Latest commit:" -ForegroundColor Cyan
git --no-pager log -1 --pretty=oneline

# Ensure upstream remote exists
$upstream = git remote -v | Select-String 'upstream' -Quiet
if (-not $upstream) {
  Write-Host "Adding upstream remote to https://github.com/Dileep2505/ResumePro.git"
  git remote add upstream https://github.com/Dileep2505/ResumePro.git
}

# Ensure authentication with gh
$null = gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "You are not authenticated with GitHub CLI. Running 'gh auth login'." -ForegroundColor Yellow
  gh auth login
  if ($LASTEXITCODE -ne 0) { Abort 'gh auth login failed or was cancelled.' }
}

# Push main to pages-build-deployment
$branch = 'main'
$targetBranch = 'pages-build-deployment'
Write-Host "Pushing local $branch to upstream:$targetBranch..." -ForegroundColor Cyan
git fetch upstream
if ($LASTEXITCODE -ne 0) { Abort 'git fetch upstream failed.' }

$pushRef = "{0}:{1}" -f $branch, $targetBranch
git push upstream $pushRef
if ($LASTEXITCODE -ne 0) { Abort 'git push failed. Ensure you have permission.' }

# Create PR
Write-Host "Creating pull request from $branch -> $targetBranch..." -ForegroundColor Cyan
$prArgs = @(
  'pr','create',
  '--base', $targetBranch,
  '--head', $branch,
  '--title', 'Deploy frontend responsive fixes',
  '--body', 'Deploy frontend responsive CSS updates to prevent cut/overlap on small screens.'
)
gh @prArgs
if ($LASTEXITCODE -ne 0) { Abort 'Failed to create PR via gh.' }

Write-Host "PR created. Done." -ForegroundColor Green
