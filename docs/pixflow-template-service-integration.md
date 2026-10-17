# Template service integration contract

The optional premium Library integrates with the template service through authenticated WordPress server requests. Implementation and paired tests belong to the Pro repository. The Free/shared repository retains compatible contracts without bundling premium service access.

Template insertion preserves source IDs, native payloads, classes, components, framework mappings and extension dependencies through the native insertion path. Preview URLs render as images. Credentials and template tokens stay server-side; authenticated requests enforce the configured origin, including scheme and effective port, and do not follow redirects.

Protected representations are scoped to site and licence identity. Every protected list/detail access revalidates authorization before a cached body is reused, including ETag responses. Revocation clears that scope and fails insertion. Network failure must not serve cached protected content. Licence changes clear scoped representations; browser detail requests deduplicate only while in flight.

Development endpoint overrides must retain HTTPS and authority binding. Switching authorities requires explicit activation for the new authority; never forward cached licence credentials to another service automatically. Deployment endpoints and private QA credentials are operator configuration, not a repository example.

Service availability and authorization do not prove visual fidelity for every catalogue asset. Validate native insertion, dependency handling, persistence after reload and unchanged unrelated site content for the relevant integration.
