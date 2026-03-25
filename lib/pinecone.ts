import { Pinecone } from '@pinecone-database/pinecone';

export const getPineconeClient = () => {
  if (!process.env.PINECONE_API_KEY) {
    console.warn('Pinecone API key is not set. Vector search will be disabled.');
    return null;
  }

  return new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
};
