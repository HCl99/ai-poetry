'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerUser } from './actions';

export function RegisterForm() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      action={async (formData) => {
        startTransition(async () => {
          const result = await registerUser(formData);
          if (result?.error) {
            alert(result.error);
          } else {
            router.push('/');
            router.refresh();
          }
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="name">昵称（可选）</Label>
        <Input id="name" name="name" type="text" placeholder="你的昵称" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input id="email" name="email" type="email" placeholder="you@example.com" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input id="password" name="password" type="password" placeholder="至少 6 位" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">确认密码</Label>
        <Input id="confirm" name="confirm" type="password" placeholder="再次输入密码" required />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? '注册中…' : '注册'}
      </Button>
    </form>
  );
}
