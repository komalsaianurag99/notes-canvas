import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-brand" href="/">
          <span className="brand-symbol">A</span>
          <span>Aardra&apos;s Library</span>
        </Link>
      </div>
    </header>
  );
}
