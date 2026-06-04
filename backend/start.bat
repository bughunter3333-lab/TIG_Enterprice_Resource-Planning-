@echo off
cd /d "%~dp0"
call venv\Scripts\activate
echo Starting TIG ERP API on http://localhost:8000
echo Press Ctrl+C to stop.
python run.py
