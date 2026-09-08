import { Command } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";

import { LoginForm } from "../../_components/login-form";

export default function LoginV1() {
  return (
    <div className="flex h-dvh">
      <div className="hidden bg-primary lg:block lg:w-1/3">
        <div className="flex h-full flex-col items-center justify-center p-12 text-center">
          <div className="space-y-6">
            <Command className="mx-auto size-12 text-primary-foreground" />
            <div className="space-y-2">
              <h1 className="font-light text-5xl text-primary-foreground">{APP_CONFIG.name}</h1>
              <p className="text-primary-foreground/80 text-xl">แผงควบคุมผู้ดูแลระบบ splitwise</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          <div className="space-y-4 text-center">
            <div className="font-medium tracking-tight">เข้าสู่ระบบ</div>
            <div className="mx-auto max-w-xl text-muted-foreground">
              ใช้บัญชี staff ของ splitwise (owner / admin / finance / support / booster)
            </div>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
