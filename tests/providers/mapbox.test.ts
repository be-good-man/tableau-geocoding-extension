import { MapboxProvider } from '../../src/providers/mapbox';

global.fetch = jest.fn();

describe('MapboxProvider', () => {
  const provider = new MapboxProvider();

  beforeEach(() => {
    (fetch as jest.Mock).mockReset();
  });

  it('should have correct metadata', () => {
    expect(provider.id).toBe('mapbox');
    expect(provider.label).toBe('Mapbox');
    expect(provider.requiresApiKey).toBe(true);
  });

  it('should parse a successful response', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        features: [{
          center: [-122.4194, 37.7749],
          place_name: 'San Francisco, California, United States',
        }],
      }),
    });

    const result = await provider.geocode('San Francisco', 'test-token');

    expect(result.latitude).toBeCloseTo(37.7749);
    expect(result.longitude).toBeCloseTo(-122.4194);
    expect(result.displayName).toBe('San Francisco, California, United States');
  });

  it('should throw when no features returned', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ features: [] }),
    });

    await expect(provider.geocode('xyzabc123', 'test-token'))
      .rejects.toThrow('Mapbox geocoding returned no results');
  });
});
