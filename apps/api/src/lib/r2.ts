export const putJson = async (bucket: R2Bucket, key: string, data: unknown) => {
  await bucket.put(key, JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
};

export const putText = async (bucket: R2Bucket, key: string, text: string, contentType: string) => {
  await bucket.put(key, text, { httpMetadata: { contentType } });
};
