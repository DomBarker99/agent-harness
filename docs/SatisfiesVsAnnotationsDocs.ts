/**
 *  | Annotations Vs. Satisfies |
 *
 */

type EmployeeNames = "John Johnson" | "Michael Brown" | "Jean Jacobs" | "Ryan James"

type Employee = {
    id : number,
    role? : string,
    officeNumber? : number | string,
    department? : string
}

type EmployeeEntrySignature = {[key : string] : Employee | undefined | string}
type EmployeeEntryRecord = Record<EmployeeNames, Employee | undefined | string>

/**
 *
 */
const EmployeeAnnotationSignature: EmployeeEntrySignature = {
    "Gerald Summers" : {id : 100212},
    "George Bean" : {id : 123141, officeNumber : "Sanitation"},
    "Jean Jacobs" : {id : 1324124, role : "Manager", department : "Accounting"},
}

const EmployeeAnnotationRecord : EmployeeEntryRecord = {
    "John Johnson" : {id : 121313},
    "Michael Brown" : {id : 33132},
    "Jean Jacobs" : {id : 1324124, role : "Manager", department : "Accounting"},
    "Ryan James" : {id : 3131242}
}

const EmployeeSatisfiesSignature = {
    "Gerald Summers" : {id : 100212},
    "George Bean" : {id : 123141, officeNumber : "Sanitation"}
} satisfies EmployeeEntrySignature

const EmployeeSatisfiesRecord  = {
    "John Johnson" : {id : 121313},
    "Michael Brown" : {id : 33132},
    "Jean Jacobs" : {id : 1324124, role : "Manager", department : "Accounting"},
    "Ryan James" : "Best Employee ever!"
} satisfies EmployeeEntryRecord

const example = EmployeeAnnotationRecord["Jean Jacobs"]

const example2 = EmployeeSatisfiesRecord["Jean Jacobs"]

const example3 = EmployeeSatisfiesRecord["Ryan James"]

