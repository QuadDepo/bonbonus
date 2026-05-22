import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/index.ts';

describe('toCsv', () => {
  it('renders a fixed header and boolean tag columns', () => {
    const csv = toCsv([
      {
        id: '1',
        gtin: null,
        title: 'Item',
        tags: ['bonus', 'vandaag', 'nutriscore_b'],
        url: 'https://example.test/item',
        sourcePageUrl: 'https://example.test/source',
      },
    ]);

    expect(csv).toContain(
      'id,gtin,title,subtitle,priceText,bonusMechanic,validFrom,validUntil,imageUrl,productSize,category,url,sourcePageUrl,sourcePageTitle,tag_bonus,tag_vandaag,tag_available_in_store,tag_nutriscore_b,tag_nutriscore_c',
    );
    expect(csv).toContain('true,true,false,true,false');
  });

  it('escapes csv values safely', () => {
    const csv = toCsv([
      {
        id: '1',
        gtin: null,
        title: 'A "quoted", title',
        subtitle: 'line1\nline2',
        tags: [],
        url: 'https://example.test/item',
        sourcePageUrl: 'https://example.test/source',
      },
    ]);

    expect(csv).toContain('"A ""quoted"", title"');
    expect(csv).toContain('"line1\nline2"');
  });
});
