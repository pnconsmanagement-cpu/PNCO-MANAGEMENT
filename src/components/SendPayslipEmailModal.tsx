import React from 'react';
import { SendPayslipModal } from './SendPayslipModal';
import { Employee, CompanyConfig } from '../types';

interface SendPayslipEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  config: CompanyConfig;
  initialChannel?: 'ZALO' | 'EMAIL';
  onUpdateEmployeeContact?: (employeeId: string, updates: { email?: string; phone?: string }) => void;
  onUpdateEmployeeEmail?: (employeeId: string, newEmail: string) => void;
}

export const SendPayslipEmailModal: React.FC<SendPayslipEmailModalProps> = (props) => {
  return <SendPayslipModal {...props} />;
};

export { SendPayslipModal };
