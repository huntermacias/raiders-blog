// Stand-in for the `sanity` package. In the real package these three helpers
// return their argument unchanged (they exist for TypeScript), so the schema
// files can be loaded and inspected without loading the whole Studio.
export const defineType = <T>(t: T): T => t
export const defineField = <T>(f: T): T => f
export const defineArrayMember = <T>(m: T): T => m
