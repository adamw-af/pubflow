# OAuth tokens encrypted at application layer before storing in Convex

Social Account OAuth tokens (access + refresh) are AES-encrypted using a key held in a Convex environment variable before being written to the database. Decryption happens only inside Convex actions at publish time. Convex has no built-in column-level encryption. Storing tokens unencrypted was rejected as unacceptable for production user data. An external secrets manager was rejected to avoid another paid service dependency.
