
DELETE FROM commission_projections WHERE proposal_id = '55209379-ad9f-4169-a801-5aed6371b3d8';
DELETE FROM payment_conditions WHERE proposal_id = '55209379-ad9f-4169-a801-5aed6371b3d8';
DELETE FROM proposal_scope_items WHERE proposal_id = '55209379-ad9f-4169-a801-5aed6371b3d8';
DELETE FROM proposal_macro_scope WHERE proposal_id = '55209379-ad9f-4169-a801-5aed6371b3d8';
DELETE FROM proposal_documents WHERE proposal_id = '55209379-ad9f-4169-a801-5aed6371b3d8';
DELETE FROM proposal_signatories WHERE signature_id IN (SELECT id FROM proposal_signatures WHERE proposal_id = '55209379-ad9f-4169-a801-5aed6371b3d8');
DELETE FROM proposal_signatures WHERE proposal_id = '55209379-ad9f-4169-a801-5aed6371b3d8';
DELETE FROM proposal_process_logs WHERE proposal_id = '55209379-ad9f-4169-a801-5aed6371b3d8';
DELETE FROM proposals WHERE id = '55209379-ad9f-4169-a801-5aed6371b3d8';
