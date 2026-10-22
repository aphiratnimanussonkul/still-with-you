import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-h1 font-semibold">{copy['page.not_found.title']}</h1>
      <p className="text-body text-muted-foreground">{copy['page.not_found.body']}</p>
      <Button asChild size="lg">
        <Link to="/">{copy['back_home']}</Link>
      </Button>
    </main>
  );
}
