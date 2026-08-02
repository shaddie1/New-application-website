import { ALL_SERVICES, COMPANY, FAQS, SERVICE_AREAS } from '../content/site';

const SITE_URL = 'https://onyxhawkcleaningservice.com';

/**
 * LocalBusiness structured data — this is what lets the company surface with
 * its address, phone and service areas in local search results.
 */
export function localBusinessJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_URL}/#business`,
    name: COMPANY.name,
    url: SITE_URL,
    telephone: COMPANY.phoneE164,
    email: COMPANY.email,
    image: `${SITE_URL}/logo.jpg`,
    logo: `${SITE_URL}/logo.jpg`,
    foundingDate: String(COMPANY.foundedYear),
    priceRange: 'KSh',
    address: {
      '@type': 'PostalAddress',
      streetAddress: COMPANY.addressLine,
      addressLocality: 'Nairobi',
      addressCountry: 'KE',
    },
    areaServed: [
      { '@type': 'City', name: 'Nairobi' },
      ...SERVICE_AREAS.map((area) => ({ '@type': 'Place', name: area })),
      { '@type': 'Country', name: 'Kenya' },
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Cleaning services',
      itemListElement: ALL_SERVICES.map((service) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: service.name, description: service.description },
      })),
    },
  };
}

export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };
}
