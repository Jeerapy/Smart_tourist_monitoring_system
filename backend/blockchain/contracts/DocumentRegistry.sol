// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DocumentRegistry {
    struct DocumentProof {
        bytes32 userHash;
        bytes32 cidHash;
        bool verified;
        uint256 timestamp;
        address submitter;
    }

    mapping(bytes32 => DocumentProof[]) private _proofsByUser;

    event DocumentProofStored(
        bytes32 indexed userHash,
        bytes32 indexed cidHash,
        bool verified,
        uint256 timestamp,
        address indexed submitter
    );

    function storeProof(bytes32 userHash, bytes32 cidHash, bool verified) external {
        DocumentProof memory p = DocumentProof({
            userHash: userHash,
            cidHash: cidHash,
            verified: verified,
            timestamp: block.timestamp,
            submitter: msg.sender
        });
        _proofsByUser[userHash].push(p);
        emit DocumentProofStored(userHash, cidHash, verified, block.timestamp, msg.sender);
    }

    function proofCount(bytes32 userHash) external view returns (uint256) {
        return _proofsByUser[userHash].length;
    }

    function latestProof(bytes32 userHash) external view returns (DocumentProof memory) {
        uint256 len = _proofsByUser[userHash].length;
        require(len > 0, "No proofs");
        return _proofsByUser[userHash][len - 1];
    }
}

