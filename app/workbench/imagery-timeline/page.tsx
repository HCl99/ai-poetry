import { readFileSync } from 'fs';
import path from 'path';
import { ImageryTimelineView, type TimelineData } from '@/components/workbench/imagery-timeline-view';

export const dynamic = 'force-dynamic';

export default function ImageryTimelinePage() {
  const raw = readFileSync(path.join(process.cwd(), 'data', 'imagery-dynasty.json'), 'utf-8');
  const data = JSON.parse(raw) as TimelineData;
  return <ImageryTimelineView data={data} />;
}
