import { GeocodioProvider } from '../../src/providers/geocodio';

global.fetch = jest.fn();

describe('GeocodioProvider', () => {
  const provider = new GeocodioProvider();

  beforeEach(() => {
    (fetch as jest.Mock).mockReset();
  });

  it('should have correct metadata', () => {
    expect(provider.id).toBe('geocodio');
    expect(provider.label).toBe('Geocodio');
    expect(provider.requiresApiKey).toBe(true);
  });

  it('should parse a successful response', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        results: [{
          location: { lat: 38.8977, lng: -77.0365 },
          formatted_address: '1600 Pennsylvania Ave NW, Washington, DC 20500',
        }],
      }),
    });

    const result = await provider.geocode('1600 Pennsylvania Ave', 'test-key');

    expect(result.latitude).toBeCloseTo(38.8977);
    expect(result.longitude).toBeCloseTo(-77.0365);
    expect(result.displayName).toBe('1600 Pennsylvania Ave NW, Washington, DC 20500');
  });

  it('should throw when no results returned', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ results: [] }),
    });

    await expect(provider.geocode('xyzabc123', 'test-key'))
      .rejects.toThrow('Geocodio returned no results');
  });
});
