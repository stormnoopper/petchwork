import th from '@/messages/th.json';

export const NAV_LINKS = [
  { href: '/#how-it-works', label: th.marketing.nav.howItWorks },
  { href: '/#data-sources', label: th.marketing.nav.dataSources },
  { href: '/#agencies', label: th.marketing.nav.agencies },
  { href: '/data', label: th.marketing.nav.rawData },
] as const;
