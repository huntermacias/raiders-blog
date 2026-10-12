import contractsJson from "@/data/lab/contracts.json"

import type { ContractsData } from "./contractsKit"

// Contracts are kept by hand (scripts/lab/build_contracts.py), and cover only the teams listed in the file.
const contracts = contractsJson as unknown as ContractsData

export function getContracts(): ContractsData {
	return contracts
}
