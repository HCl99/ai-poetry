'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authenticate } from './actions';

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      action={async (formData) => {
        startTransition(async () => {
          const err = await authenticate(formData);
          if (!err) {
            router.push('/');
            router.refresh();
          } else {
            // 错误由 formState 展示，这里简化处理
            alert(err);
          }
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input id="email" name="email" type="email" placeholder="you@example.com" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input id="password" name="password" type="password" placeholder="••••••••" required />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? '登录中…' : '登录'}
      </Button>
    </form>
  );
}
