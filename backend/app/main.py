from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, users, jobs, inventory, customers, suppliers, purchase_orders

app = FastAPI(title="Total Image ERP API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,  # required for httpOnly cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(jobs.router)
app.include_router(inventory.router)
app.include_router(customers.router)
app.include_router(suppliers.router)
app.include_router(purchase_orders.router)


@app.get("/health")
def health():
    return {"status": "ok"}
