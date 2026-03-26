# Backend (FastAPI)

## Setup
1. Copy `.env.example` to `.env` and fill required values.
2. Create and activate a virtual environment.
3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Install Tesseract OCR and ensure it is available in PATH.

## Run API

```bash
uvicorn app.main:app --reload --port 8000
```

## Blockchain workspace (inside backend)
Smart contract code lives under:

`backend/blockchain/`

### Compile/deploy (Polygon Amoy)
```bash
cd blockchain
npm install
npm run compile
npm run deploy:amoy
```

After deploy, use the contract address and ABI in backend `.env`.

## Railway notes
Set these environment variables in Railway:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_JWT_AUD`
- `PINATA_API_KEY`
- `PINATA_API_SECRET`
- `PINATA_GATEWAY_BASE`
- `DOCUMENT_ENCRYPTION_KEY_B64`
- `BLOCKCHAIN_RPC_URL`
- `BLOCKCHAIN_PRIVATE_KEY`
- `BLOCKCHAIN_ACCOUNT_ADDRESS`
- `BLOCKCHAIN_CONTRACT_ADDRESS`
- `BLOCKCHAIN_CONTRACT_ABI_PATH`
- `BLOCKCHAIN_CHAIN_NAME`

The app will fail-fast on startup if blockchain config is partially set.
