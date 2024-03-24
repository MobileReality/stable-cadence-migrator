contract interface ___LanguageDefinition {

    entitlement Capabilities
    entitlement PublishCapability
    entitlement UnpublishCapability

    entitlement StorageCapabilities
    entitlement AccountCapabilities


    entitlement GetStorageCapabilityController
    entitlement IssueStorageCapabilityController

    entitlement GetAccountCapabilityController
    entitlement IssueAccountCapabilityController

    entitlement mapping CapabilitiesMapping {
        include Identity

        StorageCapabilities -> GetStorageCapabilityController
        StorageCapabilities -> IssueStorageCapabilityController

        AccountCapabilities -> GetAccountCapabilityController
        AccountCapabilities -> IssueAccountCapabilityController
    }


    entitlement Storage
    entitlement SaveValue
    entitlement LoadValue
    entitlement CopyValue
    entitlement BorrowValue

    entitlement Contracts
    entitlement AddContract
    entitlement UpdateContract
    entitlement RemoveContract

    entitlement Keys
    entitlement AddKey
    entitlement RevokeKey

    entitlement Inbox
    entitlement PublishInboxCapability
    entitlement UnpublishInboxCapability
    entitlement ClaimInboxCapability

    entitlement mapping AccountMapping {
        include Identity

        Storage -> SaveValue
        Storage -> LoadValue
        Storage -> CopyValue
        Storage -> BorrowValue

        Contracts -> AddContract
        Contracts -> UpdateContract
        Contracts -> RemoveContract

        Keys -> AddKey
        Keys -> RevokeKey

        Inbox -> PublishInboxCapability
        Inbox -> UnpublishInboxCapability
        Inbox -> ClaimInboxCapability

        Capabilities -> StorageCapabilities
        Capabilities -> AccountCapabilities
    }

    access(all) struct Account {
        access(all) struct Storage {
            access(all) let used: UInt64
            access(all) let capacity: UInt64
            access(all) let publicPaths: [PublicPath]
            access(all) let storagePaths: [StoragePath]
            access(Storage | SaveValue)
            fun save<T: Storable>(_ value: T, to: StoragePath)
            access(all) view fun type(at path: StoragePath): Type?
            access(Storage | LoadValue)
            fun load<T: Storable>(from: StoragePath): T?
            access(Storage | CopyValue)
            view fun copy<T: AnyStruct>(from: StoragePath): T?
            access(all) view fun check<T: Any>(from: StoragePath): Bool
            access(Storage | BorrowValue)
            view fun borrow<T: &Any>(from: StoragePath): T?
            access(all) fun forEachPublic(_ function: fun(PublicPath, Type): Bool)
            access(all) fun forEachStored(_ function: fun (StoragePath, Type): Bool)
        }

        access(all) struct StorageCapabilities {
            access(Capabilities | StorageCapabilities | IssueStorageCapabilityController)
            fun issue<T: &Any>(_ path: StoragePath): Capability<T>
            access(Capabilities | StorageCapabilities | GetStorageCapabilityController)
            view fun getController(byCapabilityID: UInt64): &StorageCapabilityController?
            access(Capabilities | StorageCapabilities | GetStorageCapabilityController)
            view fun getControllers(forPath: StoragePath): [&StorageCapabilityController]
            access(Capabilities | StorageCapabilities | GetStorageCapabilityController)
            fun forEachController(
                forPath: StoragePath,
                _ function: fun(&StorageCapabilityController): Bool
            )
        }
        access(all) struct AccountCapabilities {
            access(Capabilities | AccountCapabilities | IssueAccountCapabilityController)
            fun issue<T: &Account>(): Capability<T>
            access(Capabilities | AccountCapabilities | GetAccountCapabilityController)
            view fun getController(byCapabilityID: UInt64): &AccountCapabilityController?
            access(Capabilities | AccountCapabilities | GetAccountCapabilityController)
            view fun getControllers(): [&AccountCapabilityController]
            access(Capabilities | AccountCapabilities | GetAccountCapabilityController)
            fun forEachController(_ function: fun(&AccountCapabilityController): Bool)
        }

        access(all) struct Capabilities {
            access(mapping CapabilitiesMapping)
            let storage: Account.StorageCapabilities

            access(mapping CapabilitiesMapping)
            let account: Account.AccountCapabilities

            access(all) view fun get<T: &Any>(_ path: PublicPath): Capability<T>?

            access(all) view fun borrow<T: &Any>(_ path: PublicPath): T?

            access(all) view fun exists(_ path: PublicPath): Bool

            access(Capabilities | PublishCapability)
            fun publish(_ capability: Capability, at: PublicPath)

            access(Capabilities | UnpublishCapability)
            fun unpublish(_ path: PublicPath): Capability?
        }

        access(all) struct Keys {
            access(all) let count: UInt64
            access(all) view fun get(keyIndex: Int): AccountKey?
            access(all) fun forEach(_ function: fun(AccountKey): Bool)
            access(Keys | AddKey)
            fun add(
                publicKey: PublicKey,
                hashAlgorithm: HashAlgorithm,
                weight: UFix64
            ): AccountKey
            access(Keys | RevokeKey)
            fun revoke(keyIndex: Int): AccountKey?
        }
        access(all) struct Contracts {
            access(all) let names: [String]
            access(all) view fun get(name: String): DeployedContract?
            access(all) view fun borrow<T: &Any>(name: String): T?
            access(Contracts | AddContract)
            fun add(
                name: String,
                code: [UInt8]
            ): DeployedContract
            access(Contracts | UpdateContract)
            fun update(name: String, code: [UInt8]): DeployedContract
            access(Contracts | RemoveContract)
            fun remove(name: String): DeployedContract?
        }
        access(all) struct Inbox {
            access(Inbox | PublishInboxCapability)
            fun publish(_ value: Capability, name: String, recipient: Address)
            access(Inbox | UnpublishInboxCapability)
            fun unpublish<T: &Any>(_ name: String): Capability<T>?
            access(Inbox | ClaimInboxCapability)
            fun claim<T: &Any>(_ name: String, provider: Address): Capability<T>?
        }

        access(all) let address: Address
        access(all) let balance: UFix64
        access(all) let availableBalance: UFix64
        access(mapping AccountMapping)
        let storage: Account.Storage
        access(mapping AccountMapping)
        let contracts: Account.Contracts
        access(mapping AccountMapping)
        let keys: Account.Keys
        access(mapping AccountMapping)
        let inbox: Account.Inbox
        access(mapping AccountMapping)
        let capabilities: Account.Capabilities
    }

    access(all) struct AccountCapabilityController {
        access(all) let capability: Capability
        access(all) var tag: String
        access(all) fun setTag(_ tag: String)
        access(all) let borrowType: Type
        access(all) let capabilityID: UInt64
        access(all) fun delete()
    }
    access(all) struct StorageCapabilityController {
        access(all) let capability: Capability
        access(all) var tag: String
        access(all) fun setTag(_ tag: String)
        access(all) let borrowType: Type
        access(all) let capabilityID: UInt64
        access(all) fun delete()
        access(all) fun target(): StoragePath
        access(all) fun retarget(_ target: StoragePath)
    }
    access(all) struct AccountKey {
        access(all) let keyIndex: Int
        let publicKey: PublicKey
        let hashAlgorithm: HashAlgorithm
        let weight: UFix64
        let isRevoked: Bool
    }
    access(all) struct DeployedContract {
        access(all) let address: Address
        access(all) let name: String
        access(all) let code: [UInt8]
        access(all) view fun publicTypes(): [Type]
    }

}
