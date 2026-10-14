export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }) } } }
