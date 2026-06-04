@echo off
cd /d "%~dp0"
call venv\Scripts\activate
echo Running migrations...
alembic revision --autogenerate -m "initial"
alembic upgrade head
echo.
echo Migrations done. Run seed_admin.bat to create your first admin user.
pause
