from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from web3 import Web3

from ..config import settings


class BlockchainService:
    def __init__(self) -> None:
        self._w3 = Web3(Web3.HTTPProvider(settings.blockchain_rpc_url))
        self._enabled = bool(
            settings.blockchain_rpc_url
            and settings.blockchain_private_key
            and settings.blockchain_contract_address
            and settings.blockchain_contract_abi_path
        )

    @property
    def enabled(self) -> bool:
        return self._enabled

    def _load_abi(self) -> list[dict[str, Any]]:
        path = Path(settings.blockchain_contract_abi_path)
        if not path.is_absolute():
            path = Path.cwd() / path
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and "abi" in payload:
            return payload["abi"]
        if isinstance(payload, list):
            return payload
        raise RuntimeError("Invalid contract ABI json")

    def _contract(self):
        abi = self._load_abi()
        return self._w3.eth.contract(
            address=Web3.to_checksum_address(settings.blockchain_contract_address),
            abi=abi,
        )

    @staticmethod
    def hash_user_id(user_id: str) -> str:
        return Web3.keccak(text=user_id).hex()

    @staticmethod
    def hash_cid(cid: str) -> str:
        return Web3.keccak(text=cid).hex()

    def write_document_proof(self, user_id: str, cid: str, verified: bool) -> dict[str, Any]:
        if not self.enabled:
            return {"enabled": False, "skipped": True, "reason": "blockchain_not_configured"}
        if not self._w3.is_connected():
            raise RuntimeError("Unable to connect to blockchain RPC")

        account = Web3.to_checksum_address(settings.blockchain_account_address)
        private_key = settings.blockchain_private_key
        contract = self._contract()

        user_hash = Web3.keccak(text=user_id)
        cid_hash = Web3.keccak(text=cid)
        nonce = self._w3.eth.get_transaction_count(account)
        tx = contract.functions.storeProof(user_hash, cid_hash, bool(verified)).build_transaction(
            {
                "from": account,
                "nonce": nonce,
                "gas": 300000,
                "gasPrice": self._w3.eth.gas_price,
                "chainId": self._w3.eth.chain_id,
            }
        )
        signed = self._w3.eth.account.sign_transaction(tx, private_key=private_key)
        tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)

        return {
            "enabled": True,
            "tx_hash": tx_hash.hex(),
            "status": "CONFIRMED" if int(receipt.status) == 1 else "FAILED",
            "chain": settings.blockchain_chain_name,
            "contract_address": settings.blockchain_contract_address,
            "user_hash": user_hash.hex(),
            "cid_hash": cid_hash.hex(),
            "block_number": int(receipt.blockNumber),
        }

