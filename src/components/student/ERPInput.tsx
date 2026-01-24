import { useState } from 'react';
import { useERP } from '@/lib/erp-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Loader2, Search } from 'lucide-react';

export default function ERPInput() {
  const { erp, setErp, rosterInfo, isVerifying, isVerificationEnabled, verifyErp } = useERP();
  const [inputValue, setInputValue] = useState(erp);

  const handleVerify = async () => {
    if (!inputValue.trim()) return;
    setErp(inputValue.trim());
    await verifyErp(inputValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleVerify();
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Label htmlFor="erp-input" className="text-sm font-medium mb-2 block">
              Enter your ERP
            </Label>
            <div className="flex gap-2">
              <Input
                id="erp-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., 12345"
                className="font-mono"
              />
              <Button onClick={handleVerify} disabled={isVerifying || !inputValue.trim()}>
                {isVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span className="ml-2 hidden sm:inline">Verify</span>
              </Button>
            </div>
          </div>

          {rosterInfo && isVerificationEnabled && (
            <div className="flex items-end">
              {rosterInfo.found ? (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-success/10 text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  <div className="text-sm">
                    <span className="font-medium">{rosterInfo.student_name}</span>
                    <span className="text-success/70 ml-2">({rosterInfo.class_no})</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-destructive/10 text-destructive max-w-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-sm">
                    Your ERP wasn't found in the roster. Please contact the TAs via email.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
