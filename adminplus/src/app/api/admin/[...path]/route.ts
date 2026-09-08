import { createProxyHandler } from "@/lib/adminplus/proxy-handler";

const handle = createProxyHandler("admin");

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
