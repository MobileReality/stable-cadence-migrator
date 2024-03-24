contract interface ___LanguageDefinition {
    native view fun panic(_ message: String): Never
    native view fun assert(_ condition: Bool, message: String)
    native view fun revertibleRandom<T: FixedSizeUnsignedInteger>(modulo: T): T


    access(all) struct Capability {
        access(all) let address: Address
        access(all) let id: UInt64
        access(all) view fun borrow(): T?
        access(all) view fun check(): Bool
    }

    access(all) enum HashAlgorithm: UInt8 {
        access(all) case SHA2_256
        access(all) case SHA2_384
        access(all) case SHA3_256
        access(all) case SHA3_384
        access(all) case KMAC128_BLS_BLS12_381
        access(all) case KECCAK_256
        access(all) view fun hash(_ data: [UInt8]): [UInt8]
        access(all) view fun hashWithTag(_ data: [UInt8], tag: string): [UInt8]
    }

    access(all) enum SignatureAlgorithm: UInt8 {
        access(all) case ECDSA_P256
        access(all) case ECDSA_secp256k1
        access(all) case BLS_BLS12_381
    }
    access(all) struct PublicKey {
        access(all) let publicKey: [UInt8]
        access(all) let signatureAlgorithm: SignatureAlgorithm

        access(all) view fun verify(
            signature: [UInt8],
            signedData: [UInt8],
            domainSeparationTag: String,
            hashAlgorithm: HashAlgorithm
        ): Bool

        access(all) view fun verifyPoP(_ proof: [UInt8]): Bool
        access(all) view init()
    }

    access(all) struct Block {
        access(all) let id: [UInt8; 32]
        access(all) let height: UInt64
        access(all) let view: UInt64
        access(all) let timestamp: UFix64
    }
    native view fun getCurrentBlock(): Block
    native view fun getBlock(at: UInt64): Block?
}
contract interface RLP {
    view fun decodeString(_ input: [UInt8]): [UInt8]
    view fun decodeList(_ input: [UInt8]): [[UInt8]]
}
