import { PageHeader } from './PageShell';
import CrawlerTab from '../modules/DarkWebCrawler/CrawlerTab'; // Himanshu

export default function DarkWebCrawler() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Collection"
        title="Dark Web Crawler"
        description="Control the crawl job, watch live fetches across Tor, I2P and Telegram, and inspect the activity log."
      />
      <div className="crawler-host">
        <CrawlerTab />
      </div>
    </div>
  );
}
