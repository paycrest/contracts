// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

library SharedStructs {
    /**
     * @dev Struct representing an institution.
     * @param code The code of the institution.
     * @param name The name of the institution.
     */
    struct Institution {
        bytes32 code;
        bytes32 name;
    }

    /**
     * @dev Struct representing an institution by code.
     * @param name The name of the institution.
     * @param currency The currency of the institution.
     */
    struct InstitutionByCode {
        bytes32 name;
        bytes32 currency;
    }
}