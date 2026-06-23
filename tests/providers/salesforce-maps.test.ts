import { SalesforceMapsProvider } from '../../src/providers/salesforce-maps';

global.fetch = jest.fn();

describe('SalesforceMapsProvider', () => {
  const provider = new SalesforceMapsProvider();

  beforeEach(() => {
    (fetch as jest.Mock).mockReset();
  });

  it('should have correct metadata', () => {
    expect(provider.id).toBe('salesforce-maps');
    expect(provider.label).toBe('Salesforce Maps');
    expect(provider.requiresApiKey).toBe(true);
  });

  it('should include Authorization header', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        latitude: 37.79,
        longitude: -122.39,
        formattedAddress: 'Salesforce Tower, SF',
      }),
    });

    await provider.geocode('Salesforce Tower', 'bearer-token-123');

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer bearer-token-123',
        }),
      })
    );
  });

  it('should throw on HTTP error', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(provider.geocode('test', 'bad-token'))
      .rejects.toThrow('Salesforce Maps geocoding failed: 401 Unauthorized');
  });
});
