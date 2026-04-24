@echo off
set "LINZ_SCRIPT_ROOT=%~dp0"
set "LINZ_SKILL_ROOT=%~dp0.."
node "%~dp0linz" %*
