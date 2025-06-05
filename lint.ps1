Set-Location -Path "node"
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
}
yarn cache clean
yarn
yarn lint
