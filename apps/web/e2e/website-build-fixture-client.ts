export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) } } }
