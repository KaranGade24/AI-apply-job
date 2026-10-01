import React from 'react';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';

export const ReviewTable = ({ fields = [], onFieldChange, readOnly = false }) => {
  if (!fields || fields.length === 0) {
    return <div className="text-gray-500 text-sm py-4">No review fields available.</div>;
  }

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Question / Field</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Answer</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {fields.map((f, idx) => (
            <tr key={f.fieldIndex ?? idx}>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{f.question || f.name}</td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {f.editable && !readOnly ? (
                  <Input
                    value={f.answer ?? ''}
                    onChange={(e) => onFieldChange(f.fieldIndex ?? idx, e.target.value)}
                  />
                ) : (
                  <span className="font-mono text-gray-800">{String(f.answer ?? '')}</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm">
                <Badge variant={f.source === 'user_edited' ? 'info' : 'secondary'}>{f.source || 'profile'}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
