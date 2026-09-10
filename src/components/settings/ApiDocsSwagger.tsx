import { useMemo } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import type { OpenAPIV3 } from "swagger-ui-react";

type Props = {
  spec: OpenAPIV3.Document;
};

export function ApiDocsSwagger({ spec }: Props) {
  const specKey = useMemo(() => JSON.stringify(spec.servers), [spec.servers]);

  return (
    <div className="api-docs-swagger min-h-[70vh] rounded-xl border border-border/60 bg-card overflow-hidden [&_.swagger-ui]:font-sans">
      <SwaggerUI key={specKey} spec={spec} docExpansion="list" defaultModelsExpandDepth={1} tryItOutEnabled />
    </div>
  );
}
