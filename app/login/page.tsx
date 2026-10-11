import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="container flex min-h-[calc(100vh-8rem)] items-center justify-center py-12">
      <Card className="w-full max-w-md paper-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-mountain/10">
            <BookOpen className="h-6 w-6 text-mountain" />
          </div>
          <CardTitle className="text-2xl">登录艾诗</CardTitle>
          <CardDescription>进入古诗词的 AI 探索之旅</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <div className="mt-4 text-center text-sm text-muted-foreground">
            还没有账号？{' '}
            <Link href="/register" className="text-mountain hover:underline">
              立即注册
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
