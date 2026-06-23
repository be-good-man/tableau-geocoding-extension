import { OsmProvider } from '../../src/providers/osm';

global.fetch = jest.fn();

describe('OsmProvider', () => {
  const provider = new OsmProvider();

  beforeEach(() => {
    (fetch as jest.Mock).mockReset();
  });

  it('should have correct metadata', () => {
    expect(provider.id).toBe('osm');
    expect(provider.label).toBe('OpenStreetMap (Nominatim)');
    expect(provider.requiresApiKey).toBe(false);
  });

  it('should parse a successful response', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ([{
        lat: '51.5074',
        lon: '-0.1278',
        display_name: 'London, Greater London, England, United Kingdom',
      }]),
    });

    const result = await provider.geocode('London', '');

    expect(result.latitude).toBeCloseTo(51.5074);
    expect(result.longitude).toBeCloseTo(-0.1278);
    expect(result.displayName).toBe('London, Greater London, England, United Kingdom');
  });

  it('should include User-Agent header', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ([{ lat: '0', lon: '0', display_name: 'test' }]),
    });

    await provider.geocode('test', '');

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { 'User-Agent': 'TableauGeocodingExtension/1.0' },
      })
    );
  });

  it('should throw when no results returned', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ([]),
    });

    await expect(provider.geocode('xyzabc123', ''))
      .rejects.toThrow('Nominatim returned no results');
  });
});
