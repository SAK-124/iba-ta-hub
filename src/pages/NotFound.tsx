import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GraduationCap, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 flex items-center gap-3 animate-fade-in">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <GraduationCap className="w-7 h-7 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Course Portal</h1>
          <p className="text-sm text-muted-foreground">Path not found</p>
        </div>
      </div>

      <div className="w-full max-w-md text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-2">
          <h2 className="text-6xl font-extrabold tracking-tighter text-primary">404</h2>
          <p className="text-xl font-medium text-foreground">Oops! This page doesn't exist.</p>
          <p className="text-muted-foreground text-sm">
            The link you followed may be broken, or the page may have been removed.
          </p>
        </div>

        <Button
          onClick={() => navigate("/")}
          size="lg"
          className="gap-2"
        >
          <Home className="w-4 h-4" />
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
