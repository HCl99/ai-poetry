import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from './register-form';

export default function RegisterPage() {
  return (
    <div className="container flex min-h-[calc(100vh-8rem)] items-center justify-center py-12">
      <Card className="w-full max-w-md paper-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-ochre/15">
            <UserPlus className="h-6 w-6 text-ochre-deep" />
          </div>
          <CardTitle className="text-2xl">注册艾诗</CardTitle>
          <CardDescription>创建账号，开启古诗词探索之旅</CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
          <div className="mt-4 text-center text-sm text-muted-foreground">
            已有账号？{' '}
            <Link href="/login" className="text-mountain hover:underline">
              直接登录
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
