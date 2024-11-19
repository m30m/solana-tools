'use client'

import { useState, useEffect, Suspense } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { useSearchParams } from 'next/navigation';

import bs58 from 'bs58';
import { JsonViewer } from '@textea/json-viewer';

function TransactionDecoder() {
  const searchParams = useSearchParams();
  const [base64Input, setBase64Input] = useState('');
  const [decodedText, setDecodedText] = useState('""');
  const [budgetInfo, setBudgetInfo] = useState<{
    computeUnits: number;
    microLamports: number;
  } | null>(null);

  useEffect(() => {
    const txParam = searchParams.get('tx');
    if (txParam) {
      setBase64Input(txParam);
      handleBase64Decode(txParam);
    }
  }, [searchParams]);

  const handleBase64Decode = (input: string) => {
    try {
      // First decode base64 to binary data
      const binaryString = input.includes('-') || input.includes('_')
        ? atob(input.replace(/-/g, '+').replace(/_/g, '/'))
        : atob(input);
      
      // Convert binary string to Uint8Array
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Try to parse as Solana transaction
      const transaction = VersionedTransaction.deserialize(bytes);
      
      // Convert transaction details to readable format
      const txInfo = {
        version: transaction.version,
        numSignatures: transaction.signatures.length,
        signatures: transaction.signatures.map(sig => bs58.encode(sig)),
        message: {
          header: transaction.message.header,
          numAccountKeys: transaction.message.staticAccountKeys.length,
          accountKeys: transaction.message.staticAccountKeys.map(key => key.toString()),
          numInstructions: transaction.message.compiledInstructions.length,
          instructions: transaction.message.compiledInstructions.map(instruction => ({
            programId: transaction.message.staticAccountKeys[instruction.programIdIndex].toString(),
            accountKeyIndexes: instruction.accountKeyIndexes,
            data: bs58.encode(instruction.data)
          }))
        }
      };

      // Calculate transaction budget
      let computeUnits = 0;
      let microLamports = 0;

      const computeBudgetInstructions = transaction.message.compiledInstructions.filter(
        instruction => {
          const programId = transaction.message.staticAccountKeys[instruction.programIdIndex].toString();
          return programId === 'ComputeBudget111111111111111111111111111111';
        }
      );

      for (const instruction of computeBudgetInstructions) {
        const view = new DataView(instruction.data.buffer);
        if (instruction.data[0] === 2) { // SetComputeUnitLimit
          computeUnits = view.getUint32(1, true);
        } else if (instruction.data[0] === 3) { // SetComputeUnitPrice
          microLamports = Number(view.getBigUint64(1, true));
        }
      }

      if (computeBudgetInstructions.length > 0) {
        setBudgetInfo({
          computeUnits,
          microLamports
        });
      } else {
        setBudgetInfo(null);
      }

      setDecodedText(JSON.stringify(txInfo, null, 2));
    } catch (error) {
      setBudgetInfo(null);
      setDecodedText(`"Error decoding transaction: ${error instanceof Error ? error.message : 'Unknown error'}"`);
    }
  };

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center w-full max-w-2xl">
        <div className="w-full space-y-4">
          <h2 className="text-lg font-bold mb-2">Enter base64 encoded Solana transaction:</h2>
          <textarea
            className="w-full p-4 border rounded-lg bg-background text-foreground min-h-[100px] font-mono text-sm"
            placeholder="Enter base64 encoded Solana transaction..."
            value={base64Input}
            onChange={(e) => {
              setBase64Input(e.target.value);
              handleBase64Decode(e.target.value);
            }}
          />
          
          <div className="w-full">
            <h2 className="text-lg font-bold mb-2">Decoded Transaction:</h2>
            {budgetInfo && (
              <div className="mb-4 p-4 border rounded-lg bg-black/[.05] dark:bg-white/[.06]">
                <h3 className="font-semibold mb-2">Transaction Budget:</h3>
                {budgetInfo.computeUnits > 0 && (
                  <div>Compute Unit Limit: {budgetInfo.computeUnits.toLocaleString()} CU</div>
                )}
                {budgetInfo.microLamports > 0 && (
                  <div>Compute Unit Price: {budgetInfo.microLamports} μ◎/CU</div>
                )}
              </div>
            )}
            <JsonViewer 
              value={JSON.parse(decodedText)}
              defaultInspectDepth={3}
              rootName={false}
              className="w-full p-4 border rounded-lg bg-black/[.05] dark:bg-white/[.06] overflow-auto font-mono text-sm"
              theme={"auto"}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8">
        <div className="row-start-2">Loading...</div>
      </div>
    }>
      <TransactionDecoder />
    </Suspense>
  );
}
