import { describe, expect, it } from 'vitest';
import { productSummariesToCsv } from '../../src/index.ts';

describe('productSummariesToCsv', () => {
  it('renders a header with isBonus and the tag columns', () => {
    const csv = productSummariesToCsv([
      {
        id: '597485',
        gtin: '08712345678901',
        title: 'AH Lasagne ei 2-pack',
        subtitle: 'AH',
        priceText: '€ 3,02 (was € 3,18)',
        bonusMechanic: '5% volume voordeel',
        isBonus: true,
        imageUrl: 'https://static.ah.nl/img/597485.jpg',
        tags: ['bonus', 'available_in_store'],
        productSize: '2 stuks',
        category: 'Lasagnebladen',
        url: 'https://www.ah.nl/producten/product/wi597485/ah-lasagne-ei-2-pack',
      },
    ]);

    expect(csv).toContain(
      'id,gtin,title,subtitle,priceText,bonusMechanic,isBonus,imageUrl,productSize,category,url,tag_bonus,tag_vandaag,tag_available_in_store,tag_nutriscore_b,tag_nutriscore_c',
    );
    expect(csv).toContain('true,'); // isBonus rendered as literal
    expect(csv).toContain('true,false,true,false,false'); // tag_bonus,tag_vandaag,tag_available_in_store,...
  });

  it('renders an isBonus=false row correctly', () => {
    const csv = productSummariesToCsv([
      {
        id: '12000',
        gtin: null,
        title: 'Plain Spaghetti',
        isBonus: false,
        tags: [],
        url: 'https://www.ah.nl/producten/product/wi12000/plain-spaghetti',
      },
    ]);

    expect(csv).toContain('false,'); // isBonus is false
  });
});
