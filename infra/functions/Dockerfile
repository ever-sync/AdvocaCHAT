FROM supabase/edge-runtime:v1.70.5
COPY supabase/functions /home/deno/functions
COPY supabase/config.toml /home/deno/functions/function-access.toml
CMD ["start", "--ip", "::", "--main-service", "/home/deno/functions/main"]
