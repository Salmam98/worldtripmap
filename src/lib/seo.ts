import { SITE } from './site';

export interface Crumb {
  name: string;
  path: string;
}

export function absoluteUrl(path: string, site: URL | string | undefined): string {
  const origin = String(site ?? `https://${SITE.domain}`).replace(/\/$/, '');
  return origin + (path.startsWith('/') ? path : `/${path}`);
}

/** Organization and WebSite markup for the home page: who publishes the site and what it is called. */
export function siteLd(site: URL | string | undefined): object[] {
  const home = absoluteUrl('/', site);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${home}#organization`,
      name: SITE.name,
      url: home,
      logo: absoluteUrl('/icons/icon-512.png', site),
      email: SITE.contactEmail,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${home}#website`,
      name: SITE.name,
      alternateName: 'World Trip Map',
      url: home,
      publisher: { '@id': `${home}#organization` },
      inLanguage: 'en-CA',
    },
  ];
}

export function breadcrumbLd(crumbs: Crumb[], site: URL | string | undefined): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path, site),
    })),
  };
}

export function articleLd(
  article: { title: string; description: string; path: string; published: Date; updated: Date; image: string },
  site: URL | string | undefined,
): object {
  const home = absoluteUrl('/', site);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    image: [absoluteUrl(article.image, site)],
    datePublished: article.published.toISOString(),
    dateModified: article.updated.toISOString(),
    mainEntityOfPage: absoluteUrl(article.path, site),
    author: { '@type': 'Organization', name: SITE.name, url: absoluteUrl('/about/', site) },
    publisher: { '@id': `${home}#organization`, '@type': 'Organization', name: SITE.name },
    inLanguage: 'en-CA',
  };
}
